"""Stable descriptive statistics with explicit finite-data semantics."""

from __future__ import annotations

import math
from collections.abc import Callable, Iterable
from typing import Any

from ..model import ResourceBudget
from ._core import (
    BudgetGuard,
    StatisticsStopped,
    binary64_ulp,
    centered_sum_squares,
    diagnostic,
    finite_values,
    paired_values,
    quantile_sorted,
    stable_mean,
)
from .result import StatisticsResult


def _stopped_result(
    operation: str, guard: BudgetGuard, status: str
) -> StatisticsResult:
    guard.trace.append(
        "failure",
        data={"status": status},
        important=True,
        force=True,
    )
    return StatisticsResult(
        operation,
        success=False,
        status=status,
        value=None,
        method="corrected-two-pass",
        validation={
            "truth_level": "indeterminate",
            "passed": False,
            "checks": [],
        },
        diagnostics=[
            diagnostic(status, "The computation stopped at its resource boundary.")
        ],
        trace=guard.trace,
        evaluations=guard.evaluations,
        iterations=guard.iterations,
        elapsed_ms=guard.elapsed_ms(),
    )


def describe(
    data: Iterable[Any],
    *,
    ddof: int = 1,
    nan_policy: str = "raise",
    budget: ResourceBudget | None = None,
    cancel: Callable[[], bool] | None = None,
    trace: str = "summary",
) -> StatisticsResult:
    """Compute a stable finite-sample summary.

    The mean uses `math.fsum`; variance uses a corrected two-pass centered
    sum. Quantiles use R type 7 / NumPy's default linear interpolation.
    """
    if isinstance(ddof, bool) or not isinstance(ddof, int) or ddof < 0:
        raise ValueError("ddof must be a nonnegative integer")
    guard = BudgetGuard(budget=budget, cancel=cancel, trace=trace)
    guard.trace.append(
        "start",
        data={"operation": "descriptive_statistics", "ddof": ddof},
        important=True,
        force=True,
    )
    try:
        values = finite_values(data, nan_policy=nan_policy, guard=guard)
        if len(values) <= ddof:
            raise ValueError("sample size must exceed ddof")
        mean = stable_mean(values)
        total = math.fsum(values)
        sum_squares = centered_sum_squares(values, mean)
        variance = sum_squares / (len(values) - ddof)
        ordered = sorted(values)
        q1 = quantile_sorted(ordered, 0.25)
        median = quantile_sorted(ordered, 0.5)
        q3 = quantile_sorted(ordered, 0.75)
        absolute_deviations = sorted(abs(value - median) for value in values)
        mad = quantile_sorted(absolute_deviations, 0.5)
        centered_residual = abs(math.fsum(value - mean for value in values))
        scale = max(abs(total), abs(mean) * len(values), 1.0)
        centered_tolerance = 16.0 * binary64_ulp(scale)
        checks = [
            {
                "identity": "sum(x - mean) approximately zero",
                "residual": centered_residual,
                "tolerance": centered_tolerance,
                "passed": centered_residual <= centered_tolerance,
            },
            {
                "identity": "minimum <= q1 <= median <= q3 <= maximum",
                "passed": ordered[0] <= q1 <= median <= q3 <= ordered[-1],
            },
            {
                "identity": "variance is nonnegative",
                "passed": variance >= 0.0,
            },
        ]
        passed = all(bool(check["passed"]) for check in checks)
        result_value = {
            "count": len(values),
            "sum": total,
            "mean": mean,
            "variance": variance,
            "standard_deviation": math.sqrt(variance),
            "standard_error": math.sqrt(variance / len(values)),
            "minimum": ordered[0],
            "q1": q1,
            "median": median,
            "q3": q3,
            "maximum": ordered[-1],
            "range": ordered[-1] - ordered[0],
            "interquartile_range": q3 - q1,
            "median_absolute_deviation": mad,
            "ddof": ddof,
            "quantile_method": "linear-r-type-7",
        }
        guard.trace.append(
            "validation",
            data={"checks": checks, "passed": passed},
            important=True,
            force=True,
        )
        guard.trace.append(
            "finish" if passed else "failure",
            data={"status": "converged" if passed else "validation_failed"},
            important=True,
            force=True,
        )
        return StatisticsResult(
            "descriptive_statistics",
            success=passed,
            status="converged" if passed else "validation_failed",
            value=result_value,
            method="corrected-two-pass",
            validation={
                "truth_level": "validated_approximate" if passed else "indeterminate",
                "passed": passed,
                "checks": checks,
            },
            assumptions=(
                "observations are represented as finite binary64 values",
                "ddof selects the divisor n - ddof; ddof=1 is sample variance",
            ),
            trace=guard.trace,
            evaluations=guard.evaluations,
            elapsed_ms=guard.elapsed_ms(),
        )
    except StatisticsStopped as stopped:
        return _stopped_result("descriptive_statistics", guard, stopped.status)


def quantile(
    data: Iterable[Any], probability: float, *, nan_policy: str = "raise"
) -> float:
    """Return the type-7 linear sample quantile."""
    values = sorted(finite_values(data, nan_policy=nan_policy))
    return quantile_sorted(values, float(probability))


def covariance(
    x: Iterable[Any],
    y: Iterable[Any],
    *,
    ddof: int = 1,
    nan_policy: str = "raise",
) -> float:
    """Corrected two-pass sample covariance of paired observations."""
    xs, ys = paired_values(x, y, nan_policy=nan_policy)
    if isinstance(ddof, bool) or not isinstance(ddof, int) or ddof < 0:
        raise ValueError("ddof must be a nonnegative integer")
    if len(xs) <= ddof:
        raise ValueError("sample size must exceed ddof")
    mean_x = stable_mean(xs)
    mean_y = stable_mean(ys)
    products = math.fsum(
        (xs[index] - mean_x) * (ys[index] - mean_y) for index in range(len(xs))
    )
    correction_x = math.fsum(value - mean_x for value in xs)
    correction_y = math.fsum(value - mean_y for value in ys)
    corrected = products - correction_x * correction_y / len(xs)
    return corrected / (len(xs) - ddof)


def correlation(
    x: Iterable[Any], y: Iterable[Any], *, nan_policy: str = "raise"
) -> float:
    """Pearson product-moment correlation with stable centered sums."""
    xs, ys = paired_values(x, y, nan_policy=nan_policy)
    mean_x = stable_mean(xs)
    mean_y = stable_mean(ys)
    xx = centered_sum_squares(xs, mean_x)
    yy = centered_sum_squares(ys, mean_y)
    if xx == 0.0 or yy == 0.0:
        raise ValueError("correlation is undefined for constant data")
    xy = math.fsum(
        (xs[index] - mean_x) * (ys[index] - mean_y) for index in range(len(xs))
    )
    answer = xy / math.sqrt(xx * yy)
    return min(1.0, max(-1.0, answer))
