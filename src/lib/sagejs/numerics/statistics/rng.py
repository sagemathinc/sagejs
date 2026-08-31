"""Versioned reproducible PCG32 streams and bounded distribution sampling."""

from __future__ import annotations

import math
from collections.abc import Callable, Sequence
from typing import Any

from ..model import ResourceBudget
from ._core import BudgetGuard, StatisticsStopped, diagnostic
from ._special import log_gamma
from .distributions import Binomial, ChiSquare, Distribution, Normal, Poisson, StudentT
from .result import StatisticsResult

RNG_CONTRACT_VERSION = 2
RNG_ALGORITHM = "pcg32-xsh-rr-v1"
_MASK_32 = (1 << 32) - 1
_MASK_64 = (1 << 64) - 1
_PCG_MULTIPLIER = 6364136223846793005
_MAX_REJECTION_ATTEMPTS = 1_000_000
_MIN_STUDENT_SAMPLE_DF = 0.1
_MIN_CHI_SQUARE_SAMPLE_DF = 0.1
_MAX_NORMAL_STANDARD = 16.0
_MAX_FLOAT = 1.7976931348623157e308
_MAX_SEED_WORD = (1 << 4096) - 1
_HEX_DIGITS = "0123456789abcdef"


def _hex_word(value: int) -> str:
    digits: list[str] = []
    remaining = value
    for _ in range(16):
        digits.append(_HEX_DIGITS[remaining & 15])
        remaining >>= 4
    digits.reverse()
    return "0x" + "".join(digits)


def _splitmix64(value: int) -> int:
    value = (value + 0x9E3779B97F4A7C15) & _MASK_64
    value = ((value ^ (value >> 30)) * 0xBF58476D1CE4E5B9) & _MASK_64
    value = ((value ^ (value >> 27)) * 0x94D049BB133111EB) & _MASK_64
    return (value ^ (value >> 31)) & _MASK_64


def _fold_seed(seed: int) -> int:
    if (
        isinstance(seed, bool)
        or not isinstance(seed, int)
        or seed < 0
        or seed > _MAX_SEED_WORD
    ):
        raise ValueError("seed words must be nonnegative integers of at most 4096 bits")
    folded = 0x243F6A8885A308D3
    value = seed
    while value:
        folded = _splitmix64(folded ^ (value & _MASK_64))
        value >>= 64
    return _splitmix64(folded)


class RandomStream:
    """Portable PCG32 stream with explicit algorithm and serializable state.

    A fixed seed, stream identifier, and method-call sequence specifies the
    integer core outputs. Distribution transforms are tested separately because
    platform math libraries need not be bit-identical.
    """

    def __init__(self, seed: int, *, stream: int = 0) -> None:
        if (
            isinstance(stream, bool)
            or not isinstance(stream, int)
            or stream < 0
            or stream > _MAX_SEED_WORD
        ):
            raise ValueError(
                "stream identifiers must be nonnegative integers of at most 4096 bits"
            )
        self.seed = seed
        self.stream = stream
        seed_word = _fold_seed(seed)
        stream_word = _splitmix64(_fold_seed(stream) ^ 0xD2B74407B1CE6E93)
        self._increment = ((stream_word << 1) | 1) & _MASK_64
        self._state = 0
        self._draw_count = 0
        self._normal_spare: float | None = None
        self._next_uint32_raw()
        self._state = (self._state + seed_word) & _MASK_64
        self._next_uint32_raw()
        self._draw_count = 0

    def _next_uint32_raw(self) -> int:
        old_state = self._state
        self._state = (old_state * _PCG_MULTIPLIER + self._increment) & _MASK_64
        xorshifted = (((old_state >> 18) ^ old_state) >> 27) & _MASK_32
        rotation = (old_state >> 59) & 31
        return (
            (xorshifted >> rotation) | (xorshifted << ((-rotation) & 31))
        ) & _MASK_32

    def uint32(self) -> int:
        """Return the next unsigned 32-bit output."""
        self._draw_count += 1
        return self._next_uint32_raw()

    def random(self) -> float:
        """Return a binary64 value in `[0, 1)` from 53 random bits."""
        high = self.uint32() >> 5
        low = self.uint32() >> 6
        return (high * 67_108_864 + low) / 9_007_199_254_740_992.0

    def uniform(self, lower: float = 0.0, upper: float = 1.0) -> float:
        lower_value = float(lower)
        upper_value = float(upper)
        if not math.isfinite(lower_value) or not math.isfinite(upper_value):
            raise ValueError("uniform bounds must be finite")
        if lower_value > upper_value:
            raise ValueError("uniform lower bound must not exceed upper bound")
        unit = self.random()
        answer = (1.0 - unit) * lower_value + unit * upper_value
        if not math.isfinite(answer):
            raise ArithmeticError("uniform interpolation exceeded binary64")
        return answer

    def randbelow(self, bound: int) -> int:
        """Return an unbiased integer in `range(bound)` by rejection."""
        if isinstance(bound, bool) or not isinstance(bound, int) or bound <= 0:
            raise ValueError("bound must be a positive integer")
        if bound > 1 << 32:
            raise ValueError("randbelow currently supports bounds through 2^32")
        threshold = ((1 << 32) - bound) % bound
        for _ in range(_MAX_REJECTION_ATTEMPTS):
            value = self.uint32()
            if value >= threshold:
                return value % bound
        raise ArithmeticError("randbelow rejection ceiling was exhausted")

    def normal(self, mean: float = 0.0, standard_deviation: float = 1.0) -> float:
        """Draw using the polar Box-Muller transform with a recorded spare."""
        mean_value = float(mean)
        scale = float(standard_deviation)
        if not math.isfinite(mean_value) or not math.isfinite(scale) or scale < 0.0:
            raise ValueError("normal parameters must be finite with nonnegative scale")
        if scale > _MAX_FLOAT / _MAX_NORMAL_STANDARD or abs(mean_value) > (
            _MAX_FLOAT - _MAX_NORMAL_STANDARD * scale
        ):
            raise ValueError(
                "normal parameters exceed the finite PCG/Box-Muller draw envelope"
            )
        if scale == 0.0:
            return mean_value
        if self._normal_spare is not None:
            standard = self._normal_spare
            self._normal_spare = None
            answer = mean_value + scale * standard
            if not math.isfinite(answer):
                raise ArithmeticError("normal transform exceeded binary64")
            return answer
        for _ in range(_MAX_REJECTION_ATTEMPTS):
            x = 2.0 * self.random() - 1.0
            y = 2.0 * self.random() - 1.0
            radius = x * x + y * y
            if 0.0 < radius < 1.0:
                factor = math.sqrt(-2.0 * math.log(radius) / radius)
                self._normal_spare = y * factor
                answer = mean_value + scale * x * factor
                if not math.isfinite(answer):
                    raise ArithmeticError("normal transform exceeded binary64")
                return answer
        raise ArithmeticError("Box-Muller rejection ceiling was exhausted")

    def choice(self, values: Sequence[Any]) -> Any:
        if len(values) == 0:
            raise ValueError("choice requires a nonempty sequence")
        return values[self.randbelow(len(values))]

    def sample_without_replacement(
        self, values: Sequence[Any], count: int
    ) -> list[Any]:
        """Partial Fisher-Yates sample without replacement."""
        if (
            isinstance(count, bool)
            or not isinstance(count, int)
            or not 0 <= count <= len(values)
        ):
            raise ValueError("count must be between zero and the population size")
        pool = list(values)
        for index in range(count):
            selected = index + self.randbelow(len(pool) - index)
            pool[index], pool[selected] = pool[selected], pool[index]
        return pool[:count]

    def spawn(self, index: int) -> "RandomStream":
        """Derive a deterministic child stream independent of current position."""
        if (
            isinstance(index, bool)
            or not isinstance(index, int)
            or index < 0
            or index > _MAX_SEED_WORD
        ):
            raise ValueError(
                "child index must be a nonnegative integer of at most 4096 bits"
            )
        child_seed = _splitmix64(_fold_seed(self.seed) ^ _fold_seed(index))
        child_stream = _splitmix64(_fold_seed(self.stream) ^ index ^ 0xCA5A826395121157)
        return RandomStream(child_seed, stream=child_stream)

    def state(self) -> dict[str, Any]:
        """Return a browser-safe replay record for the next method call."""
        return {
            "schema_version": RNG_CONTRACT_VERSION,
            "algorithm": RNG_ALGORITHM,
            "seed": str(self.seed),
            "stream": str(self.stream),
            "state": _hex_word(self._state),
            "increment": _hex_word(self._increment),
            "draw_count": str(self._draw_count),
            "normal_spare": self._normal_spare,
        }

    @classmethod
    def from_state(cls, record: dict[str, Any]) -> "RandomStream":
        if record.get("schema_version") != RNG_CONTRACT_VERSION:
            raise ValueError("unsupported RNG state schema")
        if record.get("algorithm") != RNG_ALGORITHM:
            raise ValueError("unsupported RNG algorithm")
        seed_text = record.get("seed")
        stream_text = record.get("stream")
        state_text = record.get("state")
        increment_text = record.get("increment")
        count_text = record.get("draw_count")
        if (
            not isinstance(seed_text, str)
            or not seed_text.isdigit()
            or len(seed_text) > 1234
            or not isinstance(stream_text, str)
            or not stream_text.isdigit()
            or len(stream_text) > 1234
            or not isinstance(count_text, str)
            or not count_text.isdigit()
            or len(count_text) > 20
        ):
            raise ValueError("RNG seed, stream, and draw_count must be decimal strings")
        if (
            not isinstance(state_text, str)
            or len(state_text) != 18
            or not state_text.startswith("0x")
            or not isinstance(increment_text, str)
            or len(increment_text) != 18
            or not increment_text.startswith("0x")
        ):
            raise ValueError("PCG32 state words must be canonical 16-digit hex strings")
        try:
            seed_value = int(seed_text)
            stream_value = int(stream_text)
            state = int(state_text[2:], 16)
            increment = int(increment_text[2:], 16)
            count = int(count_text)
        except ValueError:
            raise ValueError(
                "RNG replay record contains an invalid integer string"
            ) from None
        if (
            str(seed_value) != seed_text
            or str(stream_value) != stream_text
            or str(count) != count_text
        ):
            raise ValueError("RNG decimal strings must use canonical unsigned syntax")
        if state_text != _hex_word(state) or increment_text != _hex_word(increment):
            raise ValueError("PCG32 state words are not canonical lowercase hex")
        answer = cls(seed_value, stream=stream_value)
        if (
            not 0 <= state <= _MASK_64
            or not 0 <= increment <= _MASK_64
            or increment % 2 != 1
        ):
            raise ValueError("invalid PCG32 state words")
        if not 0 <= count <= _MASK_64:
            raise ValueError("draw_count must be an unsigned 64-bit integer")
        spare = record.get("normal_spare")
        if spare is not None and not math.isfinite(float(spare)):
            raise ValueError("normal_spare must be finite or null")
        answer._state = state
        answer._increment = increment
        answer._draw_count = count
        answer._normal_spare = None if spare is None else float(spare)
        return answer


def _sampling_envelope_error(distribution: Distribution) -> str | None:
    if isinstance(distribution, Normal):
        scale = distribution.standard_deviation
        if scale > _MAX_FLOAT / _MAX_NORMAL_STANDARD or abs(distribution.mean) > (
            _MAX_FLOAT - _MAX_NORMAL_STANDARD * scale
        ):
            return "normal parameters exceed the finite PCG/Box-Muller draw envelope"
    if (
        isinstance(distribution, StudentT)
        and distribution.degrees_of_freedom < _MIN_STUDENT_SAMPLE_DF
    ):
        return "Student-t sampling requires degrees_of_freedom >= 0.1"
    if (
        isinstance(distribution, ChiSquare)
        and distribution.degrees_of_freedom < _MIN_CHI_SQUARE_SAMPLE_DF
    ):
        return "chi-square sampling requires degrees_of_freedom >= 0.1"
    return None


def _gamma_draw(shape: float, rng: RandomStream, guard: BudgetGuard) -> float:
    if shape < 1.0:
        guard.check(1)
        uniform = rng.random()
        while uniform == 0.0:
            guard.check(1)
            uniform = rng.random()
        return _gamma_draw(shape + 1.0, rng, guard) * uniform ** (1.0 / shape)
    d = shape - 1.0 / 3.0
    c = 1.0 / math.sqrt(9.0 * d)
    while True:
        guard.check(1)
        x = rng.normal()
        factor = 1.0 + c * x
        if factor <= 0.0:
            continue
        cube = factor * factor * factor
        uniform = rng.random()
        if uniform == 0.0:
            return d * cube
        if uniform < 1.0 - 0.0331 * x * x * x * x:
            return d * cube
        if math.log(uniform) < 0.5 * x * x + d * (1.0 - cube + math.log(cube)):
            return d * cube


def _poisson_draw(rate: float, rng: RandomStream, guard: BudgetGuard) -> int:
    if rate == 0.0:
        guard.check(1)
        return 0
    if rate < 10.0:
        threshold = math.exp(-rate)
        product = 1.0
        count = 0
        while product > threshold:
            guard.check(1)
            product *= rng.random()
            count += 1
        return count - 1
    square_root = math.sqrt(rate)
    b = 0.931 + 2.53 * square_root
    a = -0.059 + 0.02483 * b
    inverse_alpha = 1.1239 + 1.1328 / (b - 3.4)
    squeeze = 0.9277 - 3.6224 / (b - 2.0)
    while True:
        guard.check(1)
        u = rng.random() - 0.5
        v = rng.random()
        us = 0.5 - abs(u)
        if us == 0.0:
            continue
        candidate = math.floor((2.0 * a / us + b) * u + rate + 0.43)
        if v == 0.0 and candidate >= 0:
            return int(candidate)
        if us >= 0.07 and v <= squeeze:
            return int(candidate)
        if candidate < 0 or (us < 0.013 and v > us):
            continue
        left = math.log(v * inverse_alpha / (a / (us * us) + b))
        right = -rate + candidate * math.log(rate) - log_gamma(candidate + 1.0)
        if left <= right:
            return int(candidate)


def _draw(
    distribution: Distribution, rng: RandomStream, guard: BudgetGuard
) -> float | int:
    if isinstance(distribution, Normal):
        guard.check(1)
        return rng.normal(distribution.mean, distribution.standard_deviation)
    if isinstance(distribution, StudentT):
        guard.check(1)
        numerator = rng.normal()
        denominator = 2.0 * _gamma_draw(
            0.5 * distribution.degrees_of_freedom, rng, guard
        )
        return numerator / math.sqrt(denominator / distribution.degrees_of_freedom)
    if isinstance(distribution, ChiSquare):
        return 2.0 * _gamma_draw(0.5 * distribution.degrees_of_freedom, rng, guard)
    if isinstance(distribution, Binomial):
        successes = 0
        if distribution.trials == 0:
            guard.check(1)
        for _ in range(distribution.trials):
            guard.check(1)
            if rng.random() < distribution.probability:
                successes += 1
        return successes
    if isinstance(distribution, Poisson):
        return _poisson_draw(distribution.rate, rng, guard)
    raise TypeError("sampling is not implemented for " + type(distribution).__name__)


def sample(
    distribution: Distribution,
    size: int,
    *,
    seed: int | None = None,
    rng: RandomStream | None = None,
    budget: ResourceBudget | None = None,
    cancel: Callable[[], bool] | None = None,
    trace: str = "summary",
) -> StatisticsResult:
    """Draw a bounded sample with complete before/after RNG replay evidence."""
    if isinstance(size, bool) or not isinstance(size, int) or size < 0:
        raise ValueError("sample size must be a nonnegative integer")
    if (seed is None) == (rng is None):
        raise ValueError("provide exactly one of seed or rng")
    if rng is None:
        if seed is None:
            raise AssertionError("unreachable random seed state")
        stream = RandomStream(seed)
    else:
        stream = rng
    guard = BudgetGuard(budget=budget, cancel=cancel, trace=trace)
    before = stream.state()
    guard.trace.append(
        "start",
        data={
            "operation": "random_sample",
            "distribution": distribution.name,
            "size": size,
            "algorithm": RNG_ALGORITHM,
        },
        important=True,
        force=True,
    )
    values: list[float | int] = []
    envelope_error = _sampling_envelope_error(distribution)
    if envelope_error is not None:
        guard.trace.append(
            "failure",
            data={"status": "invalid_problem", "reason": "unsupported_parameter_range"},
            important=True,
            force=True,
        )
        return StatisticsResult(
            "random_sample",
            success=False,
            status="invalid_problem",
            value=[],
            method=distribution.name + "-sampler",
            validation={"truth_level": "indeterminate", "passed": False, "checks": []},
            diagnostics=[
                diagnostic(
                    "unsupported_parameter_range",
                    envelope_error,
                    severity="error",
                )
            ],
            trace=guard.trace,
            evaluations=guard.evaluations,
            elapsed_ms=guard.elapsed_ms(),
            resource_budget=guard.budget,
            reproducibility={
                "replayable": True,
                "rng_before": before,
                "rng_after": stream.state(),
                "distribution": distribution.to_dict(),
                "size": size,
            },
        )
    try:
        for index in range(size):
            draw = _draw(distribution, stream, guard)
            if isinstance(draw, float) and not math.isfinite(draw):
                raise ArithmeticError("sampler produced a non-finite binary64 draw")
            values.append(draw)
            guard.trace.append(
                "evaluation",
                evaluation=index + 1,
                data={"sample_index": index},
            )
        if isinstance(distribution, (Binomial, Poisson)):
            support_ok = all(
                isinstance(value, int)
                and value >= 0
                and (
                    not isinstance(distribution, Binomial)
                    or value <= distribution.trials
                )
                for value in values
            )
        elif isinstance(distribution, ChiSquare):
            support_ok = all(float(value) >= 0.0 for value in values)
        else:
            support_ok = all(math.isfinite(float(value)) for value in values)
        validation = {
            "truth_level": "validated_approximate",
            "passed": support_ok,
            "checks": [
                {
                    "identity": "all draws lie in the declared support",
                    "passed": support_ok,
                },
                {
                    "identity": "distribution parameters lie in the qualified sampler envelope",
                    "passed": True,
                },
            ],
        }
        guard.trace.append(
            "validation",
            data=validation,
            important=True,
            force=True,
        )
        guard.trace.append(
            "finish",
            data={"status": "converged", "draws": size},
            important=True,
            force=True,
        )
        return StatisticsResult(
            "random_sample",
            success=support_ok,
            status="converged" if support_ok else "validation_failed",
            value=values,
            method=distribution.name + "-sampler",
            validation=validation,
            assumptions=(
                "the generator is deterministic and is not cryptographically secure",
                "stream identity includes the algorithm version and exact call sequence",
            ),
            trace=guard.trace,
            evaluations=guard.evaluations,
            elapsed_ms=guard.elapsed_ms(),
            resource_budget=guard.budget,
            reproducibility={
                "replayable": True,
                "rng_before": before,
                "rng_after": stream.state(),
                "distribution": distribution.to_dict(),
                "size": size,
            },
        )
    except (ArithmeticError, OverflowError, ZeroDivisionError) as error:
        guard.trace.append(
            "failure",
            data={"status": "nonfinite_evaluation", "completed_draws": len(values)},
            important=True,
            force=True,
        )
        return StatisticsResult(
            "random_sample",
            success=False,
            status="nonfinite_evaluation",
            value=values,
            method=distribution.name + "-sampler",
            validation={"truth_level": "indeterminate", "passed": False, "checks": []},
            diagnostics=[
                diagnostic(
                    "nonfinite_evaluation",
                    "Sampling stopped because the transform left its finite binary64 envelope: "
                    + str(error),
                    severity="error",
                    details={"completed_draws": len(values), "requested_draws": size},
                )
            ],
            trace=guard.trace,
            evaluations=guard.evaluations,
            elapsed_ms=guard.elapsed_ms(),
            resource_budget=guard.budget,
            reproducibility={
                "replayable": True,
                "rng_before": before,
                "rng_after": stream.state(),
                "distribution": distribution.to_dict(),
                "size": size,
            },
        )
    except StatisticsStopped as stopped:
        guard.trace.append(
            "failure",
            data={
                "status": stopped.status,
                "reason": stopped.reason,
                "completed_draws": len(values),
            },
            important=True,
            force=True,
        )
        return StatisticsResult(
            "random_sample",
            success=False,
            status=stopped.status,
            value=values,
            method=distribution.name + "-sampler",
            validation={
                "truth_level": "indeterminate",
                "passed": False,
                "checks": [],
            },
            diagnostics=[
                diagnostic(
                    stopped.status,
                    "Sampling stopped before the requested size was reached.",
                    details={
                        "statistics_reason": stopped.reason,
                        "completed_draws": len(values),
                        "requested_draws": size,
                    },
                )
            ],
            trace=guard.trace,
            evaluations=guard.evaluations,
            elapsed_ms=guard.elapsed_ms(),
            resource_budget=guard.budget,
            reproducibility={
                "replayable": True,
                "rng_before": before,
                "rng_after": stream.state(),
                "distribution": distribution.to_dict(),
                "size": size,
            },
        )
