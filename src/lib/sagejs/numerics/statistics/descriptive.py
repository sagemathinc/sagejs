"""Stable descriptive statistics with explicit finite-data semantics."""

from __future__ import annotations

import math
from collections.abc import Callable, Iterable, Sequence
from typing import Any, cast

from ..model import ResourceBudget
from ._core import (
    BudgetGuard,
    StatisticsNumericalError,
    StatisticsStopped,
    binary64_ulp,
    centered_sum_squares,
    diagnostic,
    finite_values,
    paired_values,
    quantile_sorted,
    scaled_centered_products,
    stable_mean,
)
from .prepared import StatisticsData
from .result import StatisticsResult

_MAX_VISUAL_OBSERVATIONS = 257


def _visual_observations(ordered: list[float]) -> tuple[list[float], list[float]]:
    """Return bounded values and their exact source empirical ranks."""
    if len(ordered) <= _MAX_VISUAL_OBSERVATIONS:
        indices = list(range(len(ordered)))
    else:
        last = len(ordered) - 1
        indices = [
            (index * last) // (_MAX_VISUAL_OBSERVATIONS - 1)
            for index in range(_MAX_VISUAL_OBSERVATIONS)
        ]
    last = len(ordered) - 1
    denominator = max(last, 1)
    return (
        [float(ordered[index]) for index in indices],
        [index / denominator for index in indices],
    )


def _stopped_result(
    operation: str, guard: BudgetGuard, stopped: StatisticsStopped
) -> StatisticsResult:
    guard.trace.append(
        "failure",
        data={"status": stopped.status, "reason": stopped.reason},
        important=True,
        force=True,
    )
    return StatisticsResult(
        operation,
        success=False,
        status=stopped.status,
        value=None,
        method="corrected-two-pass",
        validation={
            "truth_level": "indeterminate",
            "passed": False,
            "checks": [],
        },
        diagnostics=[
            diagnostic(
                stopped.status,
                "The computation stopped at its resource boundary.",
                details={"statistics_reason": stopped.reason},
            )
        ],
        trace=guard.trace,
        evaluations=guard.evaluations,
        iterations=guard.iterations,
        elapsed_ms=guard.elapsed_ms(),
        resource_budget=guard.budget,
    )


def _numerical_failure(
    operation: str, guard: BudgetGuard, error: StatisticsNumericalError
) -> StatisticsResult:
    guard.trace.append(
        "failure",
        data={"status": "nonfinite_evaluation"},
        important=True,
        force=True,
    )
    return StatisticsResult(
        operation,
        success=False,
        status="nonfinite_evaluation",
        value=None,
        method="corrected-two-pass",
        validation={"truth_level": "indeterminate", "passed": False, "checks": []},
        diagnostics=[
            diagnostic(
                "nonfinite_evaluation",
                str(error),
                severity="error",
            )
        ],
        trace=guard.trace,
        evaluations=guard.evaluations,
        elapsed_ms=guard.elapsed_ms(),
        resource_budget=guard.budget,
    )


def _ordinary_components(values: Sequence[float]) -> tuple[Any, ...]:
    """The original arithmetic and validation inputs, without input conversion."""
    mean = stable_mean(values)
    total = math.fsum(values)
    sum_squares = centered_sum_squares(values, mean)
    ordered = sorted(values)
    median = quantile_sorted(ordered, 0.5)
    absolute_deviations = sorted(abs(value - median) for value in values)
    centered_residual = abs(math.fsum(value - mean for value in values))
    return mean, total, sum_squares, ordered, absolute_deviations, centered_residual


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
        prepared = cast(StatisticsData, data) if type(data) is StatisticsData else None
        values: list[float] = []
        if prepared is not None:
            if nan_policy not in ("raise", "omit"):
                raise ValueError("nan_policy must be 'raise' or 'omit'")
            count = len(prepared)
        else:
            values = finite_values(data, nan_policy=nan_policy, guard=guard)
            count = len(values)
        if count <= ddof:
            raise ValueError("sample size must exceed ddof")
        if prepared is not None:
            components = prepared._components(guard)
        else:
            components = _ordinary_components(values)
        mean, total, sum_squares, ordered, absolute_deviations, centered_residual = (
            components
        )
        variance = sum_squares / (count - ddof)
        q1 = quantile_sorted(ordered, 0.25)
        median = quantile_sorted(ordered, 0.5)
        q3 = quantile_sorted(ordered, 0.75)
        mad = quantile_sorted(absolute_deviations, 0.5)
        scale = max(abs(total), abs(mean) * count, 1.0)
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
        minimum = float(ordered[0])
        maximum = float(ordered[-1])
        result_value = {
            "count": count,
            "sum": total,
            "mean": mean,
            "variance": variance,
            "standard_deviation": math.sqrt(variance),
            "standard_error": math.sqrt(variance / count),
            "minimum": minimum,
            "q1": q1,
            "median": median,
            "q3": q3,
            "maximum": maximum,
            "range": maximum - minimum,
            "interquartile_range": q3 - q1,
            "median_absolute_deviation": mad,
            "ddof": ddof,
            "quantile_method": "linear-r-type-7",
        }
        visual_values, visual_ranks = _visual_observations(ordered)
        guard.trace.append(
            "phase",
            data={
                "count": count,
                "mean": mean,
                "median": median,
                "interquartile_range": q3 - q1,
                "visual_sample_count": len(visual_values),
            },
        )
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
            resource_budget=guard.budget,
            backend=prepared.backend if prepared is not None else "ordinary-python",
            preparation=prepared.preparation() if prepared is not None else None,
            domain_payload={
                "plot": {
                    "kind": "descriptive",
                    "ordered_values": visual_values,
                    "empirical_ranks": visual_ranks,
                    "source_count": count,
                }
            },
        )
    except StatisticsStopped as stopped:
        return _stopped_result("descriptive_statistics", guard, stopped)
    except StatisticsNumericalError as error:
        return _numerical_failure("descriptive_statistics", guard, error)
    except OverflowError:
        return _numerical_failure(
            "descriptive_statistics",
            guard,
            StatisticsNumericalError(
                "the summary exceeds the finite binary64 result envelope"
            ),
        )


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
    scale_x, scale_y, _, _, xy = scaled_centered_products(xs, ys, mean_x, mean_y)
    if scale_x == 0.0 or scale_y == 0.0:
        return 0.0
    answer = (xy / (len(xs) - ddof)) * scale_x * scale_y
    if not math.isfinite(answer):
        raise ArithmeticError("covariance exceeds the binary64 result envelope")
    return answer


def correlation(
    x: Iterable[Any], y: Iterable[Any], *, nan_policy: str = "raise"
) -> float:
    """Pearson product-moment correlation with stable centered sums."""
    xs, ys = paired_values(x, y, nan_policy=nan_policy)
    mean_x = stable_mean(xs)
    mean_y = stable_mean(ys)
    _, _, xx, yy, xy = scaled_centered_products(xs, ys, mean_x, mean_y)
    if xx == 0.0 or yy == 0.0:
        raise ValueError("correlation is undefined for constant data")
    answer = (xy / math.sqrt(xx)) / math.sqrt(yy)
    return min(1.0, max(-1.0, answer))
