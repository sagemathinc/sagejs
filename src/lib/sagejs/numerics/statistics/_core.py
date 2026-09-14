"""Shared validation, budgets, and stable scalar helpers for statistics."""

from __future__ import annotations

import math
import time
from collections.abc import Callable, Iterable, Sequence
from itertools import zip_longest
from typing import Any, cast

from ..diagnostics import NumericalDiagnostic
from ..model import ResourceBudget
from ..trace import NumericalTrace, TracePolicy


class StatisticsStopped(Exception):
    """Internal bounded-execution stop carrying a stable status code."""

    def __init__(self, status: str, reason: str | None = None) -> None:
        super().__init__(status)
        self.status = status
        self.reason = status if reason is None else reason


class StatisticsNumericalError(ArithmeticError):
    """Finite input exceeded the qualified binary64 operation envelope."""


def binary64_ulp(value: float) -> float:
    """Spacing of finite `value` in IEEE-754 binary64 arithmetic."""
    magnitude = abs(float(value))
    if not math.isfinite(magnitude):
        raise ValueError("ULP requires a finite value")
    if magnitude == 0.0:
        return math.ldexp(1.0, -1074)
    _, exponent = math.frexp(magnitude)
    return math.ldexp(1.0, max(exponent - 53, -1074))


class BudgetGuard:
    """Track hard work, iteration, elapsed-time, and cancellation limits."""

    def __init__(
        self,
        *,
        budget: ResourceBudget | None = None,
        cancel: Callable[[], bool] | None = None,
        trace: str = "summary",
        max_trace_events: int | None = None,
        max_trace_bytes: int | None = None,
    ) -> None:
        self.budget = (
            ResourceBudget(
                max_iterations=100,
                max_evaluations=100_000,
                max_elapsed_ms=30_000,
                max_trace_events=256,
                max_trace_bytes=1_000_000,
            )
            if budget is None
            else budget
        )
        events = (
            self.budget.max_trace_events
            if max_trace_events is None
            else max_trace_events
        )
        byte_limit = (
            self.budget.max_trace_bytes if max_trace_bytes is None else max_trace_bytes
        )
        self.trace = NumericalTrace(
            TracePolicy(trace, max_events=events, max_bytes=byte_limit)
        )
        self.cancel = cancel
        self.evaluations = 0
        self.iterations = 0
        self._started = time.monotonic()

    def elapsed_ms(self) -> float:
        return (time.monotonic() - self._started) * 1000.0

    def check(self, work: int = 0) -> None:
        if self.cancel is not None and self.cancel():
            raise StatisticsStopped("cancelled", "cancellation_callback")
        if self.elapsed_ms() > self.budget.max_elapsed_ms:
            raise StatisticsStopped("cancelled", "maximum_elapsed_time")
        if work < 0:
            raise ValueError("work increment must be nonnegative")
        if self.evaluations + work > self.budget.max_evaluations:
            raise StatisticsStopped("maximum_evaluations")
        self.evaluations += work

    def iterate(self) -> int:
        self.check()
        if self.iterations >= self.budget.max_iterations:
            raise StatisticsStopped("maximum_iterations")
        self.iterations += 1
        return self.iterations


def finite_values(
    data: Iterable[Any],
    *,
    nan_policy: str = "raise",
    guard: BudgetGuard | None = None,
    minimum: int = 1,
    maximum: int | None = None,
) -> list[float]:
    """Materialize finite binary64 observations under an explicit NaN policy."""
    if nan_policy not in ("raise", "omit"):
        raise ValueError("nan_policy must be 'raise' or 'omit'")
    values: list[float] = []
    for raw in data:
        if guard is not None:
            guard.check(1)
        value = float(raw)
        if not math.isfinite(value):
            if nan_policy == "omit" and math.isnan(value):
                continue
            raise ValueError("observations must be finite")
        if maximum is not None and len(values) >= maximum:
            raise MemoryError("statistics data exceeds its buffer budget")
        values.append(value)
    if len(values) < minimum:
        raise ValueError(
            "at least " + str(minimum) + " finite observations are required"
        )
    return values


def paired_values(
    x: Iterable[Any],
    y: Iterable[Any],
    *,
    nan_policy: str = "raise",
    guard: BudgetGuard | None = None,
    minimum: int = 2,
) -> tuple[list[float], list[float]]:
    """Materialize equal-length finite pairs, omitting pairs atomically."""
    if nan_policy not in ("raise", "omit"):
        raise ValueError("nan_policy must be 'raise' or 'omit'")
    clean_x: list[float] = []
    clean_y: list[float] = []
    sentinel = object()
    for raw_x, raw_y in zip_longest(x, y, fillvalue=sentinel):
        if raw_x is sentinel or raw_y is sentinel:
            raise ValueError("x and y must have the same length")
        if guard is not None:
            guard.check(1)
        xv = float(cast(Any, raw_x))
        yv = float(cast(Any, raw_y))
        if not math.isfinite(xv) or not math.isfinite(yv):
            if nan_policy == "omit" and (math.isnan(xv) or math.isnan(yv)):
                continue
            raise ValueError("paired observations must be finite")
        clean_x.append(xv)
        clean_y.append(yv)
    if len(clean_x) < minimum:
        raise ValueError("at least " + str(minimum) + " finite pairs are required")
    return clean_x, clean_y


def stable_mean(values: Sequence[float]) -> float:
    if len(values) == 0:
        raise ValueError("mean requires at least one value")
    try:
        return math.fsum(values) / len(values)
    except OverflowError:
        scale = max(abs(value) for value in values)
        if scale == 0.0:
            return 0.0
        answer = scale * (math.fsum(value / scale for value in values) / len(values))
        if not math.isfinite(answer):
            raise StatisticsNumericalError(
                "the mean is outside the finite binary64 result envelope"
            ) from None
        return answer


def centered_sum_squares(values: Sequence[float], center: float) -> float:
    """Return corrected two-pass sum of squares around `center`."""
    deviations = [value - center for value in values]
    scale = max((abs(value) for value in deviations), default=0.0)
    if not math.isfinite(scale):
        raise StatisticsNumericalError(
            "centering the observations exceeds the finite binary64 envelope"
        )
    if scale == 0.0:
        return 0.0
    normalized = [value / scale for value in deviations]
    raw_normalized = math.fsum(value * value for value in normalized)
    correction_normalized = math.fsum(normalized)
    corrected_normalized = (
        raw_normalized - correction_normalized * correction_normalized / len(values)
    )
    if corrected_normalized < 0.0 and corrected_normalized > -16.0 * binary64_ulp(
        max(raw_normalized, 1.0)
    ):
        corrected_normalized = 0.0
    try:
        corrected = (scale * scale) * corrected_normalized
    except OverflowError:
        corrected = float("inf")
    if not math.isfinite(corrected):
        raise StatisticsNumericalError(
            "the centered sum of squares exceeds the binary64 result envelope"
        )
    return corrected


def scaled_centered_products(
    x: Sequence[float],
    y: Sequence[float],
    center_x: float,
    center_y: float,
) -> tuple[float, float, float, float, float]:
    """Return overflow-safe normalized centered cross products and scales."""
    deviations_x = [value - center_x for value in x]
    deviations_y = [value - center_y for value in y]
    scale_x = max((abs(value) for value in deviations_x), default=0.0)
    scale_y = max((abs(value) for value in deviations_y), default=0.0)
    if not math.isfinite(scale_x) or not math.isfinite(scale_y):
        raise StatisticsNumericalError(
            "centering paired observations exceeds the finite binary64 envelope"
        )
    if scale_x == 0.0 or scale_y == 0.0:
        return scale_x, scale_y, 0.0, 0.0, 0.0
    normalized_x = [value / scale_x for value in deviations_x]
    normalized_y = [value / scale_y for value in deviations_y]
    xx = math.fsum(value * value for value in normalized_x)
    yy = math.fsum(value * value for value in normalized_y)
    xy = math.fsum(normalized_x[index] * normalized_y[index] for index in range(len(x)))
    sum_x = math.fsum(normalized_x)
    sum_y = math.fsum(normalized_y)
    xx -= sum_x * sum_x / len(x)
    yy -= sum_y * sum_y / len(y)
    xy -= sum_x * sum_y / len(x)
    tolerance = 16.0 * binary64_ulp(max(xx, yy, 1.0))
    if -tolerance <= xx < 0.0:
        xx = 0.0
    if -tolerance <= yy < 0.0:
        yy = 0.0
    if xx < 0.0 or yy < 0.0 or not all(math.isfinite(item) for item in (xx, yy, xy)):
        raise StatisticsNumericalError(
            "centered paired products are outside the binary64 envelope"
        )
    return scale_x, scale_y, xx, yy, xy


def quantile_sorted(values: Sequence[float], probability: float) -> float:
    """R type-7 / NumPy linear quantile of already sorted observations."""
    if len(values) == 0:
        raise ValueError("quantile requires at least one value")
    if not 0.0 <= probability <= 1.0:
        raise ValueError("probability must be in [0, 1]")
    if len(values) == 1:
        return float(values[0])
    index = (len(values) - 1) * probability
    lower = int(math.floor(index))
    fraction = index - lower
    if fraction == 0.0:
        return float(values[lower])
    answer = (1.0 - fraction) * values[lower] + fraction * values[lower + 1]
    if not math.isfinite(answer):
        raise StatisticsNumericalError(
            "quantile interpolation exceeds the finite binary64 envelope"
        )
    return float(answer)


def median(values: Sequence[float]) -> float:
    return quantile_sorted(sorted(values), 0.5)


def validate_probability(probability: float, *, open_interval: bool = False) -> float:
    value = float(probability)
    valid = 0.0 < value < 1.0 if open_interval else 0.0 <= value <= 1.0
    if not math.isfinite(value) or not valid:
        interval = "(0, 1)" if open_interval else "[0, 1]"
        raise ValueError("probability must be in " + interval)
    return value


def validate_alternative(alternative: str) -> str:
    if alternative not in ("two-sided", "less", "greater"):
        raise ValueError("alternative must be 'two-sided', 'less', or 'greater'")
    return alternative


def diagnostic(
    code: str,
    message: str,
    *,
    severity: str = "warning",
    details: dict[str, Any] | None = None,
) -> NumericalDiagnostic:
    aliases = {
        "unsupported_parameter_range": "nonfinite_evaluation",
        "zero_residual_variance": "loss_of_significance",
        "zero_variance": "validation_failed",
    }
    canonical_code = aliases.get(code, code)
    diagnostic_details = {} if details is None else dict(details)
    if canonical_code != code:
        diagnostic_details["statistics_reason"] = code
    return NumericalDiagnostic(
        canonical_code,
        severity=severity,
        message=message,
        details=diagnostic_details,
    )
